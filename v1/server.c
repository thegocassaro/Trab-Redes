#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <pthread.h>
#include <arpa/inet.h>
#include <sys/socket.h>
#include <errno.h>
#include <unistd.h>
#include <sndfile.h>

#define PORT 8080
#define BUFFER_SIZE 1024

// Tamanho do buffer em "Frames". 
// Um frame contém uma amostra para CADA canal (ex: 2 amostras por frame se for estéreo).
#define FRAMES_PER_BUFFER 512

// Estrutura para passar dados para a thread do cliente
typedef struct {
    int client_socket;
    struct sockaddr_in client_addr;
} client_data_t;

// Estados de reprodução
#define STATE_PLAYING 1
#define STATE_PAUSED  0
#define STATE_STOPPED -1

char file_name[250] = "My Chemical Romance - Im Not Okay I Promise audio.wav";

void *handle_client(void *arg) {
    client_data_t *cli_data = (client_data_t *)arg;
    int sock = cli_data->client_socket;
    char buffer[BUFFER_SIZE];
    char cmd_buffer[16]; // Buffer menor exclusivo para comandos de controle

    printf("Cliente conectado: %s:%d\n", 
           inet_ntoa(cli_data->client_addr.sin_addr), 
           ntohs(cli_data->client_addr.sin_port));

           
    // 1. Abertura do arquivo de áudio
    SF_INFO sfinfo;
    SNDFILE *infile = sf_open(file_name, SFM_READ, &sfinfo);
    
    if (!infile) {
        printf("Erro ao abrir o arquivo '%s': %s\n", file_name, sf_strerror(NULL));
        close(sock);
        free(cli_data);
        pthread_exit(NULL);
    }

    printf("Iniciando streaming: %d Hz, %d canais\n", sfinfo.samplerate, sfinfo.channels);

    // O buffer para guardar as amostras lidas. Usamos 'short' pois 
    // o padrão comum de WAV é PCM de 16 bits (2 bytes por amostra).
    short audio_buffer[FRAMES_PER_BUFFER * sfinfo.channels];
    
    int state = STATE_PLAYING;

    while (state != STATE_STOPPED) {
        
        if (state == STATE_PLAYING) {
            // 1. Tenta ler um comando sem bloquear a thread (MSG_DONTWAIT)
            ssize_t n = recv(sock, cmd_buffer, sizeof(cmd_buffer) - 1, MSG_DONTWAIT);
            
            if (n > 0) {
                cmd_buffer[n] = '\0'; // Garante terminação da string
                
                // Remove quebras de linha caso o cliente envie via Telnet/Netcat
                cmd_buffer[strcspn(cmd_buffer, "\r\n")] = 0; 

                if (strcmp(cmd_buffer, "PAUSE") == 0) {
                    printf("Comando recebido: PAUSE\n");
                    state = STATE_PAUSED;
                    continue; // Pula o envio de áudio e vai para a próxima iteração
                } else if (strcmp(cmd_buffer, "STOP") == 0) {
                    printf("Comando recebido: STOP\n");
                    state = STATE_STOPPED;
                    continue;
                }
            } else if (n == 0) {
                printf("Cliente desconectou.\n");
                break;
            } else if (n < 0 && (errno != EAGAIN && errno != EWOULDBLOCK)) {
                // Se deu um erro real (diferente de "não tem dados agora")
                perror("Erro na leitura do socket");
                break;
            }

            // 2. Lendo um bloco (chunk) de áudio
            // sf_readf_short lê por *frames*, garantindo que os canais fiquem alinhados.
            sf_count_t read_frames = sf_readf_short(infile, audio_buffer, FRAMES_PER_BUFFER);
            
            if (read_frames == 0) {
                printf("Fim do arquivo alcançado.\n");
                state = STATE_STOPPED; // ou use sf_seek(infile, 0, SEEK_SET) para fazer loop
                continue;
            }

            // 3. Calculando o tamanho exato em bytes para enviar pela rede
            size_t bytes_to_send = read_frames * sfinfo.channels * sizeof(short);

            ssize_t sent_bytes = send(sock, audio_buffer, bytes_to_send, 0);
            if (sent_bytes <= 0) {
                printf("Falha no envio da rede.\n");
                break;
            }

            // 4. O Controle de Ritmo (Throttling)
            // Calculamos quanto tempo (em segundos) esse pacote de áudio representa na vida real
            // Tempo = Frames / Taxa de Amostragem
            double time_in_seconds = (double)read_frames / sfinfo.samplerate;
            
            // Convertendo para microsegundos para a função usleep
            usleep((unsigned int)(time_in_seconds * 1000000.0));

        } else if (state == STATE_PAUSED) {
            // 3. Thread em pausa: leitura BLOQUEANTE (economia de CPU)
            ssize_t n = recv(sock, cmd_buffer, sizeof(cmd_buffer) - 1, 0);
            
            if (n > 0) {
                cmd_buffer[n] = '\0';
                cmd_buffer[strcspn(cmd_buffer, "\r\n")] = 0;

                if (strcmp(cmd_buffer, "PLAY") == 0) {
                    printf("Comando recebido: PLAY\n");
                    state = STATE_PLAYING;
                } else if (strcmp(cmd_buffer, "STOP") == 0) {
                    printf("Comando recebido: STOP\n");
                    state = STATE_STOPPED;
                }
            } else {
                printf("Cliente desconectou durante a pausa.\n");
                break;
            }
        }
    }

    printf("Encerrando conexão com cliente.\n");
    sf_close(infile);
    close(sock);
    free(cli_data);
    pthread_exit(NULL);
}

int main() {
    int server_fd, new_socket;
    struct sockaddr_in address;
    int opt = 1;
    int addrlen = sizeof(address);

    // 1. Criação do socket TCP
    if ((server_fd = socket(AF_INET, SOCK_STREAM, 0)) == 0) {
        perror("Falha ao criar o socket");
        exit(EXIT_FAILURE);
    }

    // Configura opções para reuso de porta
    if (setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt))) {
        perror("Erro no setsockopt");
        exit(EXIT_FAILURE);
    }

    address.sin_family = AF_INET;
    address.sin_addr.s_addr = INADDR_ANY;
    address.sin_port = htons(PORT);

    // 2. Bind (associa o socket à porta)
    if (bind(server_fd, (struct sockaddr *)&address, sizeof(address)) < 0) {
        perror("Erro no bind");
        exit(EXIT_FAILURE);
    }

    // 3. Listen (coloca o servidor em modo de escuta)
    if (listen(server_fd, 5) < 0) { // Fila de até 5 conexões
        perror("Erro no listen");
        exit(EXIT_FAILURE);
    }

    printf("Servidor de Streaming rodando na porta %d...\n", PORT);

    // 4. Aceitação de múltiplos clientes em loop
    while (1) {
        if ((new_socket = accept(server_fd, (struct sockaddr *)&address, (socklen_t*)&addrlen)) < 0) {
            perror("Erro no accept");
            continue;
        }

        // Aloca memória para os dados do cliente para evitar condições de corrida na thread
        client_data_t *cli_data = malloc(sizeof(client_data_t));
        cli_data->client_socket = new_socket;
        cli_data->client_addr = address;

        // Cria a thread dedicada para despachar o áudio para este cliente
        pthread_t thread_id;
        if (pthread_create(&thread_id, NULL, handle_client, (void *)cli_data) != 0) {
            perror("Falha ao criar thread");
            free(cli_data);
            close(new_socket);
        }
        
        // Desanexa a thread para que o sistema limpe os recursos automaticamente quando ela finalizar
        pthread_detach(thread_id);
    }

    close(server_fd);
    return 0;
}