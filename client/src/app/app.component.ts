import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { AudioService } from './services/audio.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit, OnDestroy {
  // Controle de Estado: Define o comportamento e as permissões do terminal na topologia da rede
  papel: 'NENHUM' | 'RESULTADO' | 'MICROFONE' = 'NENHUM';
  estadoSala: 'AGUARDANDO' | 'TOCANDO' = 'AGUARDANDO';

  // Controle de UX e Feedback Visual
  tempoRestante: number = 10;
  mensagemLog: { texto: string, tipo: 'erro' | 'sucesso' | 'info' } | null = null;

  musicasFiltradas: string[] = [];
  musicaSelecionada: string = '';
  nomeParticipante: string = '';

  volumeMusica: number = 0.2; 
  volumeVoz: number = 1.0;    
  
  // Master Clock: Elemento nativo isolado para reproduzir a base estática sem sofrer Jitter da rede
  audioPlayer: HTMLAudioElement = new Audio();

  resultadoReconhecimento: any = null;
  estaReconhecendo: boolean = false;

  constructor(private audioService: AudioService, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    // Listener Principal: Ouve os broadcasts do servidor Go para sincronizar o estado da sala
    this.audioService.onComandoRecebido = (comando) => {
      console.log("Comando do Servidor:", comando);
      
      if (comando.tipo === 'COMANDO_PLAY' || (comando.tipo === 'SALA_ESTADO' && comando.tocando)) {
        this.estadoSala = 'TOCANDO';
        this.musicaSelecionada = comando.musica;
        
        if (this.papel === 'RESULTADO') {
          // Compensação de Latência: Atrasamos a base local em 500ms para aguardar a viagem do pacote TCP da voz
          setTimeout(() => {
            this.tocarMP3();
          }, 500); 
        } else {
          // Sincronia de Origem: O nó transmissor (Microfone) inicia a base no "tempo zero"
          this.tocarMP3();
        }

      } else if (comando.tipo === 'COMANDO_STOP' || (comando.tipo === 'SALA_ESTADO' && !comando.tocando)) {
        this.estadoSala = 'AGUARDANDO';
        this.musicaSelecionada = '';
        
        // Liberação de Hardware: Desliga o microfone imediatamente para economizar banda
        if (this.papel === 'MICROFONE') {
          this.audioService.desligarMicrofone();
          this.nomeParticipante = ''; 
        }
        
        // Interrupção do Master Clock
        this.audioPlayer.pause();
        this.audioPlayer.currentTime = 0;
      }
      
      this.cdr.detectChanges();
    };
  }

  // Sistema de Log Não-Bloqueante: Substitui interrupções de thread (alerts) por componentes reativos
  mostrarLog(texto: string, tipo: 'erro' | 'sucesso' | 'info' = 'info') {
    this.mensagemLog = { texto, tipo };
    this.cdr.detectChanges();
    
    // Auto-limpeza: O toast desaparece automaticamente após 4 segundos
    setTimeout(() => {
      this.mensagemLog = null;
      this.cdr.detectChanges();
    }, 4000);
  }

  // Paradigma Transacional: Fluxo HTTP para gravação em bloco, consumo de API e temporizador reativo
  async buscarMusicaShazam() {
    this.estaReconhecendo = true;
    this.resultadoReconhecimento = null;
    this.tempoRestante = 10; 

    // Relógio de Interface: Contagem regressiva independente da thread de rede
    const intervalo = setInterval(() => {
      this.tempoRestante--;
      this.cdr.detectChanges();
      if (this.tempoRestante <= 0) {
        clearInterval(intervalo);
      }
    }, 1000);

    try {
      const resposta = await this.audioService.reconhecerMusica();
      
      // Parse de Metadados: Renderiza a resposta do Proxy Go
      if (resposta && resposta.status === 'success' && resposta.result) {
        this.resultadoReconhecimento = resposta.result;
        this.mostrarLog("Música identificada com sucesso!", 'sucesso');
      } else {
        this.mostrarLog("Não foi possível identificar a música. Tente chegar mais perto.", 'erro');
      }
    } catch (erro) {
      this.mostrarLog("Erro ao conectar com o servidor para identificação.", 'erro');
    } finally {
      this.estaReconhecendo = false;
      clearInterval(intervalo); 
    }
  }

  async definirComoResultado() {
    this.papel = 'RESULTADO';
    // Inicializa o nó receptor: Abre o motor de áudio e aguarda os pacotes via TCP
    await this.audioService.iniciarComoResultado();
  }

  async definirComoMicrofone() {
    this.papel = 'MICROFONE';
    // Conexão Passiva: Estabelece o túnel WebSocket apenas para monitorar o estado da sala
    await this.audioService.conectarApenasServidor();
  }

  aoDigitar(termo: string) {
    if (termo.trim() === '') {
      this.musicasFiltradas = [];
      return;
    }
    const bancoRemoto = [
      'Parabéns Pra Você',
      'Evidências - Chitãozinho & Xororó',
      'Fogo e Paixão - Wando'
    ];
    this.musicasFiltradas = bancoRemoto.filter(m => m.toLowerCase().includes(termo.toLowerCase()));
  }

  selecionarMusica(musica: string, inputElement: HTMLInputElement) {
    inputElement.value = musica;
    this.musicaSelecionada = musica;
    this.musicasFiltradas = [];
  }

  async iniciarMusica(nome: string) {
    // Validação de Estado utilizando o novo sistema de logs visuais
    if (!this.musicaSelecionada) {
      this.mostrarLog('Selecione uma música antes de iniciar!', 'erro');
      return;
    }
    if (nome.trim() === '') {
      this.mostrarLog('Digite o seu nome para assumir o microfone!', 'erro');
      return;
    }
    this.nomeParticipante = nome;
    
    // Gatilho de Streaming: Aciona a captura de hardware estritamente no momento do uso
    await this.audioService.ligarMicrofone();
    
    this.estadoSala = 'TOCANDO';
    // Broadcast de Controle: Avisa a rede para iniciar a execução da base musical
    this.audioService.enviarComando({ tipo: 'COMANDO_PLAY', musica: this.musicaSelecionada });
  }

  async juntarSeAMusicaExistente(nome: string) {
    if (nome.trim() === '') {
      this.mostrarLog('Digite o seu nome para entrar na música!', 'erro');
      return;
    }
    this.nomeParticipante = nome;
    // Concorrência: Injeta um novo fluxo de voz na sessão TCP que já está ativa
    await this.audioService.ligarMicrofone();
  }

  pararMusica() {
    // Propaga o sinal de interrupção pela rede para sincronizar a parada de todos os nós
    this.audioService.enviarComando({ tipo: 'COMANDO_STOP' });
  }

  tocarMP3() {
    // Execução Isolada: A base musical não trafega pela rede para evitar gargalos de banda
    try {
      this.audioPlayer.src = `/musica.mp3`; 
      this.audioPlayer.volume = this.volumeMusica; 
      this.audioPlayer.load();
      // Tratamento de Exceção: Previne travamentos silenciosos por políticas de autoplay dos navegadores
      this.audioPlayer.play().catch(e => {
        console.warn("Áudio não reproduzido (bloqueio do navegador ou sem arquivo):", e);
      });
    } catch(e) {
      console.error("Falha geral ao carregar áudio:", e);
    }
  }

  mudarVolumeMusica(event: any) {
    this.volumeMusica = event.target.value;
    this.audioPlayer.volume = this.volumeMusica;
  }

  mudarVolumeVoz(event: any) {
    this.volumeVoz = event.target.value;
    // Modula a amplitude dos pacotes binários que chegam da rede pelo GainNode
    this.audioService.setVolumeVoz(this.volumeVoz);
  }

  voltarInicio() {
    // Rotina de Limpeza (Cleanup): Desmonta conexões de rede e destrava o hardware local
    this.audioService.stop();
    this.audioPlayer.pause();
    this.papel = 'NENHUM';
    this.estadoSala = 'AGUARDANDO';
    this.nomeParticipante = '';
  }

  ngOnDestroy() {
    // Prevenção de Vazamento de Memória: Garante o fechamento das sessões
    this.voltarInicio();
  }
}