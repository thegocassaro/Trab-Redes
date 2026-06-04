import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http'; // IMPORTANTE

@Injectable({
  providedIn: 'root'
})
export class AudioService {
  private audioContext?: AudioContext;
  private mediaStream?: MediaStream;
  private workletNode?: AudioWorkletNode;
  private gainNode?: GainNode; 
  private ws?: WebSocket;

  public onComandoRecebido: (comando: any) => void = () => {};

  // Injete o HttpClient no construtor
  constructor(private http: HttpClient) { }

  private conectarWebSocket() {
    return new Promise<void>((resolve, reject) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }
      const servidorIP = window.location.hostname;
      this.ws = new WebSocket(`ws://${servidorIP}:8080/ws`);
      this.ws.binaryType = 'arraybuffer';
      
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(e);
    });
  }

  enviarComando(comando: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(comando));
    }
  }

  // FUNÇÃO DA CAIXA DE SOM (RESULTADO)
  async iniciarComoResultado() {
    await this.conectarWebSocket();
    
    this.ws!.onmessage = (event) => {
      if (typeof event.data === 'string') {
        this.onComandoRecebido(JSON.parse(event.data));
        return;
      }
      if (event.data instanceof ArrayBuffer && this.workletNode) {
        const pcm16 = new Int16Array(event.data);
        const float32 = new Float32Array(pcm16.length);
        for (let i = 0; i < pcm16.length; i++) {
          float32[i] = pcm16[i] < 0 ? pcm16[i] / 0x8000 : pcm16[i] / 0x7FFF;
        }
        this.workletNode.port.postMessage(float32);
      }
    };

    try {
      this.audioContext = new AudioContext({ sampleRate: 8000 });
      await this.audioContext.audioWorklet.addModule('/audio-processor.js');
      
      this.workletNode = new AudioWorkletNode(this.audioContext, 'audio-processor');
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = 1.0;

      this.workletNode.connect(this.gainNode);
      this.gainNode.connect(this.audioContext.destination);
      
      // Força a liberação do áudio para não travar no Chrome
      if (this.audioContext.state === 'suspended') {
         await this.audioContext.resume();
      }
      console.log("Aba de Resultado ativa e ouvindo.");
    } catch (e) {
      console.error("Erro ao iniciar o motor de áudio:", e);
    }
  }

  // FUNÇÃO DO CELULAR PARA APENAS ENTRAR NA SALA SEM LIGAR O MIC
  async conectarApenasServidor() {
    await this.conectarWebSocket();
    this.ws!.onmessage = (event) => {
      if (typeof event.data === 'string') {
        this.onComandoRecebido(JSON.parse(event.data));
      }
    };
  }

  // FUNÇÃO ATIVADA APENAS QUANDO O CLIENTE CLICA EM INICIAR/ENTRAR NA MÚSICA
  async ligarMicrofone() {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 8000, channelCount: 1 } 
      });

      this.audioContext = new AudioContext({ sampleRate: 8000 });
      await this.audioContext.audioWorklet.addModule('/audio-processor.js');

      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.workletNode = new AudioWorkletNode(this.audioContext, 'audio-processor');
      
      source.connect(this.workletNode);

      this.workletNode.port.onmessage = (event) => {
        const audioData: Float32Array = event.data;
        const pcm16 = new Int16Array(audioData.length);
        for (let i = 0; i < audioData.length; i++) {
          const s = Math.max(-1, Math.min(1, audioData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(pcm16.buffer);
        }
      };
    } catch (e) {
      console.error("Microfone bloqueado:", e);
      alert("Permissão do microfone negada. Não é possível cantar.");
    }
  }

  // CORTA O ÁUDIO E O ACESSO AO MIC IMEDIATAMENTE
  desligarMicrofone() {
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = undefined;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = undefined;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = undefined;
    }
  }

  setVolumeVoz(valor: number) {
    if (this.gainNode) {
      this.gainNode.gain.value = valor;
    }
  }

  stop() {
    this.desligarMicrofone();
    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }
    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = undefined;
    }
  }

  // NOVA FUNÇÃO: Módulo Shazam
  reconhecerMusica(): Promise<any> {
    return new Promise(async (resolve, reject) => {
      try {
        // Pede permissão e pega o microfone
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // MediaRecorder é feito para gravar arquivos (diferente do Worklet que é tempo real)
        const mediaRecorder = new MediaRecorder(stream);
        const audioChunks: Blob[] = [];

        // Acumula os pedaços de áudio gravados
        mediaRecorder.addEventListener("dataavailable", event => {
          if (event.data.size > 0) {
            audioChunks.push(event.data);
          }
        });

        // Quando parar de gravar, junta os pedaços e envia
        mediaRecorder.addEventListener("stop", () => {
          // Cria o arquivo final
          const audioBlob = new Blob(audioChunks, { type: 'audio/webm' }); 
          
          // Desliga o microfone (libera o hardware)
          stream.getTracks().forEach(track => track.stop());

          // Monta o formulário de envio
          const formData = new FormData();
          formData.append('audio', audioBlob, 'amostra.webm');

          const servidorIP = window.location.hostname;
          const url = `http://${servidorIP}:8080/api/recognize`;

          // Envia para o Go
          this.http.post(url, formData).subscribe({
            next: (resultadoDaAudd) => resolve(resultadoDaAudd),
            error: (erro) => reject(erro)
          });
        });

        // Inicia a gravação
        mediaRecorder.start();
        console.log("Gravando áudio para reconhecimento...");

        // Define o tempo que ele vai ficar "ouvindo" a música antes de enviar (5 segundos)
        setTimeout(() => {
          console.log("Fim da gravação. Enviando para análise...");
          mediaRecorder.stop();
        }, 5000); 

      } catch (e) {
        console.error("Microfone bloqueado ou erro na gravação:", e);
        reject(e);
      }
    });
  }
}