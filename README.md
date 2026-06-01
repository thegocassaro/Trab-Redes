Para compilar o servidor, use:
    gcc server.c -o server -lpthread -lsndfile

No segundo terminal, após rodar o servidor e prover a porta:
    nc localhost 8080
    pode usar comandos PLAY, PAUSE e STOP