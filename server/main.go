package main

import (
	"encoding/json"
	"fmt"
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

func main() {
	http.HandleFunc("/ws", handleConnections)
	fmt.Println("Servidor Central iniciado na porta 8080...")
	http.ListenAndServe(":8080", nil)
}
