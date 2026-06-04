# Contexto do Projeto: Karaokê Distribuído (Trabalho de Redes)

## Arquitetura Geral
- **Backend:** Go (Golang) rodando na porta 8080. Utiliza a biblioteca Gorilla WebSocket.
- **Frontend:** Angular. Utiliza a Web Audio API nativa (AudioContext, GainNode, AudioWorklet).
- **Comunicação:** WebSocket bidirecional. Trafega JSON para comandos de estado (Play/Stop) e dados binários brutos (Int16Array/Float32Array) para o streaming de áudio.

## Regras de Negócio e Papéis (Muito Importante)
O sistema possui uma separação estrita de responsabilidades para evitar latência e microfonia (eco):
1. **O Servidor (Go):** Atua apenas como um roteador (Mixer). Ele recebe comandos JSON e repassa para todos. Ele recebe pacotes binários de áudio de um cliente e faz o broadcast para os outros clientes. O servidor não processa e não toca áudio.
2. **Cliente Resultado (A Tela/Caixa de Som):** Fica responsável por tocar o arquivo instrumental local (MP3) e reproduzir o áudio binário que chega da rede. Este cliente NÃO captura microfone.
3. **Cliente Microfone (Os Celulares):** Fica responsável por capturar o microfone via getUserMedia, processar em um AudioWorklet e enviar os bytes para o WebSocket. Este cliente escuta os comandos JSON, mas NÃO toca o arquivo MP3 e NÃO reproduz o áudio da rede para evitar eco.

## Arquivos Chave
- `server/main.go`: Gerencia as conexões concorrentes e o broadcast de JSON/Binário.
- `client/src/app/services/audio.service.ts`: Gerencia o WebSocket e a Web Audio API. Possui métodos distintos para iniciar como Resultado ou como Microfone.
- `client/public/audio-processor.js`: O AudioWorkletProcessor que roda em background thread para converter PCM 16-bit e Float32 sem travar a thread principal do Angular.
- `client/src/app/app.component.ts`: Controla a interface, os estados (papel do cliente) e o elemento HTMLAudioElement que toca o MP3.