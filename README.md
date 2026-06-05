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
Linux Nativo, macOS ou Windows Nativo:
cd client
ng serve --host 00.00.00.0 --proxy-config proxy.conf.json
(Acesse pelo celular usando o IP da máquina na rede Wi-Fi, ex: http://192.168.1.15:4200)

WSL2:
cd client
ng serve --host 00.00.00.0 --disable-host-check --proxy-config proxy.conf.json

Descubra o IP interno do seu WSL executando ifconfig no terminal do Linux (procure o IP 172.x.x.x).
Abra o PowerShell como Administrador no Windows e crie uma ponte de rede executando:
`netsh interface portproxy add v4tov4 listenport=4200 listenaddress=0.0.0.0 connectport=4200 connectaddress=IP_INTERNO_DO_WSL`
Caso o Firewall do Windows bloqueie, libere a porta: "New-NetFirewallRule -DisplayName "Angular Dev" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 4200"

Descubra o IP do seu computador Windows na rede Wi-Fi (ipconfig.exe). Acesse pelo celular usando este IP na porta 4200.

Para "desinstalar" o ambiente do projeto da sua rede, rode no PowerShell (Admin):
`netsh interface portproxy delete v4tov4 listenport=4200 listenaddress=0.0.0.0`
`Remove-NetFirewallRule -DisplayName "Angular Dev"`
```
- **Permissão do navegador do celular**
```
chrome://flags
insecure origins treated as secure
http://00.00.00.0:4200
Ativado
```
// Nos dois tópicos acima 00.00.00.0 é o IP da conexão de rede atual do computador que os servidores foram abertos.