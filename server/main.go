package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type ComandoJSON struct {
	Tipo    string `json:"tipo"`
	Musica  string `json:"musica"`
	Tocando bool   `json:"tocando"`
}

// Atualizamos o mapa para armazenar uma string (ID) e adicionamos um contador
type ClientManager struct {
	clients       map[*websocket.Conn]string
	mu            sync.Mutex
	musicaTocando bool
	musicaAtual   string
	contador      int 
}

var manager = ClientManager{
	clients: make(map[*websocket.Conn]string),
}

// O método Register agora gera e retorna o ID único de 16 caracteres
func (cm *ClientManager) Register(conn *websocket.Conn) string {
	cm.mu.Lock()
	defer cm.mu.Unlock() // Garante o destravamento automático do mutex

	cm.contador++
	id := fmt.Sprintf("user_%011d", cm.contador)
	cm.clients[conn] = id

	if cm.musicaTocando {
		estado := ComandoJSON{Tipo: "SALA_ESTADO", Musica: cm.musicaAtual, Tocando: true}
		conn.WriteJSON(estado)
	}
	
	return id
}

func (cm *ClientManager) Unregister(conn *websocket.Conn) {
	cm.mu.Lock()
	delete(cm.clients, conn)
	cm.mu.Unlock()
}

func handleConnections(w http.ResponseWriter, r *http.Request) {
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer ws.Close()

	// Captura o ID exclusivo desta conexão
	clientID := manager.Register(ws)
	defer manager.Unregister(ws)

	for {
		messageType, payload, err := ws.ReadMessage()
		if err != nil {
			break
		}

		if messageType == websocket.TextMessage {
			var comando ComandoJSON
			if err := json.Unmarshal(payload, &comando); err == nil {
				manager.mu.Lock()
				if comando.Tipo == "COMANDO_PLAY" {
					manager.musicaTocando = true
					manager.musicaAtual = comando.Musica
				} else if comando.Tipo == "COMANDO_STOP" {
					manager.musicaTocando = false
					manager.musicaAtual = ""
				}

				for client := range manager.clients {
					client.WriteJSON(comando)
				}
				manager.mu.Unlock()
			}
		}

		if messageType == websocket.BinaryMessage {
			// Anexa o ID (16 bytes) na frente do pacote de áudio
			idBytes := []byte(clientID)
			pacoteAssinado := append(idBytes, payload...)

			manager.mu.Lock()
			for client := range manager.clients {
				if client != ws {
					// Envia o pacote com a assinatura
					client.WriteMessage(websocket.BinaryMessage, pacoteAssinado)
				}
			}
			manager.mu.Unlock()
		}
	}
}

// Paradigma Transacional (Proxy Reverso): Rota HTTP REST para o módulo de Detecção Musical
func handleRecognize(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	err := r.ParseMultipartForm(10 << 20)
	if err != nil {
		http.Error(w, "Erro ao processar formulário", http.StatusBadRequest)
		return
	}

	file, handler, err := r.FormFile("audio")
	if err != nil {
		http.Error(w, "Erro ao extrair arquivo de áudio", http.StatusBadRequest)
		return
	}
	defer file.Close()

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	// Segurança de Infraestrutura: Injeta a chave secreta da API no backend, isolando do frontend Angular
	_ = writer.WriteField("api_token", "7cf3d41000b3234a3cf4200d1cd0875f")

	part, err := writer.CreateFormFile("file", handler.Filename)
	if err != nil {
		http.Error(w, "Erro interno ao montar formulário", http.StatusInternalServerError)
		return
	}
	io.Copy(part, file)
	writer.Close()

	// Delegação em Nuvem: Encaminha o arquivo empacotado via POST para a API externa (AudD)
	req, err := http.NewRequest("POST", "https://api.audd.io/", body)
	if err != nil {
		http.Error(w, "Erro ao criar requisição HTTP", http.StatusInternalServerError)
		return
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		http.Error(w, "Falha na comunicação com a API externa", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	// Pass-through: Devolve o JSON intacto da API externa direto para a renderização do cliente
	w.Header().Set("Content-Type", "application/json")
	io.Copy(w, resp.Body)
}

func main() {
	http.HandleFunc("/ws", handleConnections)
	http.HandleFunc("/api/recognize", handleRecognize)
	fmt.Println("Servidor Central iniciado na porta 8080...")
	// Ponto de Entrada: Inicializa o servidor web atrelado à porta padrão de desenvolvimento
	http.ListenAndServe(":8080", nil)
}
