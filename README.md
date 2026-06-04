# Karaokê

Projeto desenvolvido para a disciplina de Redes de Computadores. 

## Objetivo
Desenvolver um servidor capaz de receber fluxos de áudio de múltiplos clientes simultaneamente, processar a mixagem (juntar os áudios) em tempo real, retransmitir o resultado para os participantes e gravar a sessão continuamente no servidor. 

O desenvolvimento segue uma evolução gradual, abordando comunicação via sockets, sincronização, escalabilidade e métricas.

## Arquitetura 
- **Topologia:** Cliente-Servidor (Estrela). O servidor atua como um nó central (Mixer) responsável por receber, sincronizar e agrupar as faixas de áudio.
- **Protocolo de Transporte:** Sockets TCP (via **WebSockets**). 
  - *Justificativa:* Para viabilizar testes dinâmicos usando os navegadores dos celulares no laboratório, optamos por uma interface Web. Como navegadores bloqueiam sockets UDP arbitrários por segurança, adotamos WebSockets, que operam sobre TCP, fornecendo uma conexão bidirecional persistente ideal para streaming web.
- **Backend (Servidor):** Go (Golang) - Escolhido pela alta eficiência em concorrência (`goroutines`) necessária para mixar múltiplos buffers de áudio em tempo real.
- **Frontend (Cliente):** Angular (TypeScript) - Interface web para capturar o microfone via `Web Audio API` e transmitir os dados de forma contínua.

## Como rodar o projeto
- **Servidor backend**
```
  cd server
  go run main.go
```
- **Aplicacao Web / Frontend**
```
cd client
ng serve --host 00.00.00.0
```
- **Permissão do navegador do celular**
```
chrome://flags
insecure origins treated as secure
http://00.00.00.0:4200
Ativado
```
// Nos dois tópicos acima 00.00.00.0 é o IP da conexão de rede atual do computador que os servidores foram abertos. 
