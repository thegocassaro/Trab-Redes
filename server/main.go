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
	fmt.Println("\n--- INICIANDO RECONHECIMENTO DE ÁUDIO ---")
	
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	// 1. Recebe o arquivo
	err := r.ParseMultipartForm(10 << 20)
	if err != nil {
		fmt.Println("[ERRO FATAL 1] Falha ao processar formulário:", err)
		http.Error(w, "Erro", 500)
		return
	}

	file, handler, err := r.FormFile("audio")
	if err != nil {
		fmt.Println("[ERRO FATAL 2] Falha ao extrair arquivo 'audio':", err)
		http.Error(w, "Erro", 500)
		return
	}
	defer file.Close()
	
	fmt.Printf("-> Arquivo recebido do Angular: %s (Tamanho: %d bytes)\n", handler.Filename, handler.Size)

	// 2. Prepara envio para a AudD
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	// ATENÇÃO: Verifique se o seu token real está aqui!
	_ = writer.WriteField("api_token", "7cf3d41000b3234a3cf4200d1cd0875f") 

	part, err := writer.CreateFormFile("file", handler.Filename)
	if err != nil {
		fmt.Println("[ERRO FATAL 3] Falha ao criar form multipart interno:", err)
		http.Error(w, "Erro", 500)
		return
	}
	io.Copy(part, file)
	writer.Close()

	fmt.Println("-> Enviando arquivo para a API da AudD.io...")

	// 3. Requisita a AudD
	req, err := http.NewRequest("POST", "https://api.audd.io/", body)
	if err != nil {
		fmt.Println("[ERRO FATAL 4] Falha ao criar requisição HTTP para a internet:", err)
		http.Error(w, "Erro", 500)
		return
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		fmt.Println("[ERRO FATAL 5] Falha na conexão com a AudD:", err)
		http.Error(w, "Erro", 500)
		return
	}
	defer resp.Body.Close()

	// LER O CORPO DA RESPOSTA (O JSON DA AUDD)
	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		fmt.Println("[ERRO] Não foi possível ler a resposta da AudD")
		http.Error(w, "Erro", 500)
		return
	}

	// IMPRIMIR O QUE A AUDD RESPONDEU
	fmt.Println("-> Resposta RAW da AudD:", string(bodyBytes))

	// 4. Devolve pro Angular
	w.Header().Set("Content-Type", "application/json")
	w.Write(bodyBytes) // Repassa os bytes lidos para o Angular
	fmt.Println("--- RECONHECIMENTO FINALIZADO ---")
}

func main() {
	http.HandleFunc("/ws", handleConnections)
	http.HandleFunc("/api/recognize", handleRecognize)
	fmt.Println("Servidor Central iniciado na porta 8080...")
	http.ListenAndServe(":8080", nil)
}
