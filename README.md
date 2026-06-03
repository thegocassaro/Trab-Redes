# Multiplexador de Áudio em Tempo Real (UDP)

Projeto desenvolvido para a disciplina de Redes de Computadores. 

## Objetivo
Desenvolver um servidor capaz de receber áudio de múltiplos clientes simultaneamente via sockets UDP, processar a mixagem (juntar os áudios) em tempo real, retransmitir o resultado para os participantes e gravar a sessão. O desenvolvimento seguirá a evolução em fases (Comunicação, Escalabilidade e Observabilidade).

## Arquitetura
- **Topologia:** Cliente-Servidor (Estrela)
- **Protocolo de Transporte:** UDP (priorizando tempo real sobre garantia de entrega)
- **Servidor:** [A definir - Sugestão: Go]
- **Cliente:** [A definir - Sugestão: Python]

## Como rodar o projeto
- **Dependências do cliente em python**
´´´
    sudo apt update
    sudo apt install portaudio19-dev python3-pyaudio
´´´