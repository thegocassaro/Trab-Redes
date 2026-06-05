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

type ClientManager struct {
	clients       map[*websocket.Conn]bool
	mu            sync.Mutex
	musicaTocando bool
	musicaAtual   string
}

var manager = ClientManager{
	clients: make(map[*websocket.Conn]bool),
}

func (cm *ClientManager) Register(conn *websocket.Conn) {
	cm.mu.Lock()
	cm.clients[conn] = true
	// Se ja tem musica rolando, avisa o novato para ele entrar direto como microfone ativo
	if cm.musicaTocando {
		estado := ComandoJSON{Tipo: "SALA_ESTADO", Musica: cm.musicaAtual, Tocando: true}
		conn.WriteJSON(estado)
	}
	cm.mu.Unlock()
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

	manager.Register(ws)
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

				// Repassa o comando para todos saberem o que esta acontecendo
				for client := range manager.clients {
					client.WriteJSON(comando)
				}
				manager.mu.Unlock()
			}
		}

		if messageType == websocket.BinaryMessage {
			// Repassa o audio binario para todos (a aba de Resultado vai reproduzir)
			manager.mu.Lock()
			for client := range manager.clients {
				if client != ws {
					client.WriteMessage(websocket.BinaryMessage, payload)
				}
			}
			manager.mu.Unlock()
		}
	}
}

// Novo Endpoint para Reconhecimento de Música (Módulo Shazam)
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

	// Token ativo
	_ = writer.WriteField("api_token", "7cf3d41000b3234a3cf4200d1cd0875f") 

	part, err := writer.CreateFormFile("file", handler.Filename)
	if err != nil {
		http.Error(w, "Erro interno ao montar formulário", http.StatusInternalServerError)
		return
	}
	io.Copy(part, file)
	writer.Close()

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

	// Repassa a resposta diretamente para o Angular
	w.Header().Set("Content-Type", "application/json")
	io.Copy(w, resp.Body)
}

func main() {
	http.HandleFunc("/ws", handleConnections)
	http.HandleFunc("/api/recognize", handleRecognize)
	fmt.Println("Servidor Central iniciado na porta 8080...")
	http.ListenAndServe(":8080", nil)
}
