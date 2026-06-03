# Multiplexador de Áudio

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
- **Dependências do Servidor em GO**
Link do site oficial: [https://go.dev/dl/]