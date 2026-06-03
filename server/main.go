package main

import (
	"fmt"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
)

// Configura o Upgrader para aceitar conexões WebSocket de qualquer origem.
// Necessário pois o frontend (Angular) e o servidor (Go) rodam em portas diferentes localmente.
var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// ClientManager centraliza o estado das conexões ativas com complexidade O(1) de busca.
// O Mutex garante a thread-safety do mapa 'clients', aplicando exclusão mútua para
// prevenir Condições de Corrida (Race Conditions) durante o acesso concorrente pelas Goroutines.
type ClientManager struct {
	clients map[*websocket.Conn]bool
	mu      sync.Mutex
}

var manager = ClientManager{
	clients: make(map[*websocket.Conn]bool),
}

// Função auxiliar para adicionar um cliente na lista
func (cm *ClientManager) Register(conn *websocket.Conn) {
	cm.mu.Lock()
	cm.clients[conn] = true
	cm.mu.Unlock()
	fmt.Printf("Cliente registrado. Total ativos: %d\n", len(cm.clients))
}

// Função auxiliar para remover um cliente quando ele desconectar
func (cm *ClientManager) Unregister(conn *websocket.Conn) {
	cm.mu.Lock()
	delete(cm.clients, conn)
	cm.mu.Unlock()
	fmt.Printf("Cliente removido. Total ativos: %d\n", len(cm.clients))
}

func handleConnections(w http.ResponseWriter, r *http.Request) {
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		fmt.Println("Erro ao fazer upgrade:", err)
		return
	}
	defer ws.Close()

	// Registra o novo cliente assim que a conexão WebSocket abre
	manager.Register(ws)

	// Garante que ele será removido da lista quando essa função terminar (desconexão)
	defer manager.Unregister(ws)

	for {
		messageType, payload, err := ws.ReadMessage()
		if err != nil {
			break // Sai do loop se o cliente fechar a aba ou desconectar
		}

		if messageType == websocket.BinaryMessage {
			manager.mu.Lock()
			for client := range manager.clients {
				// Impede que o áudio seja enviado de volta para quem acabou de falar
				if client != ws {
					err := client.WriteMessage(websocket.BinaryMessage, payload)
					if err != nil {
						fmt.Printf("Erro ao transmitir para [%s]: %v\n", client.RemoteAddr().String(), err)
					}
				}
			}
			manager.mu.Unlock()
		}
	}
}

func main() {
	http.HandleFunc("/ws", handleConnections)
	fmt.Println("Servidor HTTP/WebSocket rodando de forma concorrente na porta 8080...")
	err := http.ListenAndServe(":8080", nil)
	if err != nil {
		fmt.Println("Erro catastrófico ao iniciar o servidor:", err)
	}
}
