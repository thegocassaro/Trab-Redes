import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { AudioService } from './services/audio.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit, OnDestroy {
  papel: 'NENHUM' | 'RESULTADO' | 'MICROFONE' = 'NENHUM';
  estadoSala: 'AGUARDANDO' | 'TOCANDO' = 'AGUARDANDO';

  musicasFiltradas: string[] = [];
  musicaSelecionada: string = '';
  nomeParticipante: string = '';

  volumeMusica: number = 0.2; 
  volumeVoz: number = 1.0;    
  audioPlayer: HTMLAudioElement = new Audio();

  constructor(private audioService: AudioService, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.audioService.onComandoRecebido = (comando) => {
      console.log("Comando do Servidor:", comando);
      
      if (comando.tipo === 'COMANDO_PLAY' || (comando.tipo === 'SALA_ESTADO' && comando.tocando)) {
        this.estadoSala = 'TOCANDO';
        this.musicaSelecionada = comando.musica;
        
        // Agora todos (TV e Celular) tentam tocar de forma segura
        this.tocarMP3();

      } else if (comando.tipo === 'COMANDO_STOP' || (comando.tipo === 'SALA_ESTADO' && !comando.tocando)) {
        this.estadoSala = 'AGUARDANDO';
        this.musicaSelecionada = '';
        
        // Se este aparelho era um microfone, remove ele da gravação
        // Assim, na próxima música, ele volta para a fase de "entrar na música"
        if (this.papel === 'MICROFONE') {
          this.audioService.desligarMicrofone();
          this.nomeParticipante = ''; 
        }
        
        // Pausa a música
        this.audioPlayer.pause();
        this.audioPlayer.currentTime = 0;
      }
      
      this.cdr.detectChanges();
    };
  }

  async definirComoResultado() {
    this.papel = 'RESULTADO';
    await this.audioService.iniciarComoResultado();
  }

  async definirComoMicrofone() {
    this.papel = 'MICROFONE';
    // O celular conecta na sala só para ver o status, NÃO abre a gravação de voz ainda
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
    if (!this.musicaSelecionada) {
      alert('Selecione uma música!');
      return;
    }
    if (nome.trim() === '') {
      alert('Digite o seu nome!');
      return;
    }
    this.nomeParticipante = nome;
    
    // O microfone só acende a luz vermelha de gravação exatamente neste momento
    await this.audioService.ligarMicrofone();
    
    this.estadoSala = 'TOCANDO';
    this.audioService.enviarComando({ tipo: 'COMANDO_PLAY', musica: this.musicaSelecionada });
  }

  async juntarSeAMusicaExistente(nome: string) {
    if (nome.trim() === '') {
      alert('Digite o seu nome!');
      return;
    }
    this.nomeParticipante = nome;
    // O microfone secundário ativa a gravação para participar
    await this.audioService.ligarMicrofone();
  }

  pararMusica() {
    this.audioService.enviarComando({ tipo: 'COMANDO_STOP' });
  }

  tocarMP3() {
    try {
      this.audioPlayer.src = `/musica.mp3`; 
      this.audioPlayer.volume = this.volumeMusica; 
      this.audioPlayer.load();
      // O catch previne o erro silencioso se o arquivo falhar ou o navegador travar
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
    this.audioService.setVolumeVoz(this.volumeVoz);
  }

  voltarInicio() {
    this.audioService.stop();
    this.audioPlayer.pause();
    this.papel = 'NENHUM';
    this.estadoSala = 'AGUARDANDO';
    this.nomeParticipante = '';
  }

  ngOnDestroy() {
    this.voltarInicio();
  }
}