import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class AudioService {
  private audioContext?: AudioContext;
  private mediaStream?: MediaStream;
  private workletNode?: AudioWorkletNode;
  private gainNode?: GainNode; 
  private ws?: WebSocket;
  private clientNodes: Map<string, AudioWorkletNode> = new Map();
  public onComandoRecebido: (comando: any) => void = () => {};

  // Injeta o módulo HTTP para transações REST da API de reconhecimento
  constructor(private http: HttpClient) { }

  private conectarWebSocket() {
    return new Promise<void>((resolve, reject) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }
      
      // Define o protocolo dinamicamente (wss para HTTPS, ws para HTTP)
      const protocoloWs = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host; 
      
      this.ws = new WebSocket(`${protocoloWs}//${host}/ws`);
      
      // Configura a recepção para ArrayBuffer, focando na otimização da rede
      this.ws.binaryType = 'arraybuffer';
      
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(e);
    });
  }

  enviarComando(comando: any) {
    // Roteador de estado: envia comandos de controle em formato JSON
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(comando));
    }
  }

  async iniciarComoResultado() {
    await this.conectarWebSocket();
    
    // Inicializa o contexto principal e o controle de volume master primeiro
    try {
      this.audioContext = new AudioContext({ sampleRate: 24000 });
      await this.audioContext.audioWorklet.addModule('/audio-processor.js');
      
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = 1.0;
      this.gainNode.connect(this.audioContext.destination);
      
      if (this.audioContext.state === 'suspended') {
         await this.audioContext.resume();
      }
      console.log("Aba de Resultado ativa e ouvindo.");
    } catch (e) {
      console.error("Erro ao iniciar o motor de áudio:", e);
      return;
    }

    this.ws!.onmessage = (event) => {
      if (typeof event.data === 'string') {
        this.onComandoRecebido(JSON.parse(event.data));
        return;
      }

      if (event.data instanceof ArrayBuffer && this.audioContext) {
        const arrayBuffer = event.data;

        // Separa os 16 bytes do cabeçalho de identificação
        const idBytes = arrayBuffer.slice(0, 16);
        const audioBytes = arrayBuffer.slice(16);

        // Descompacta a string de ID para descobrir quem está cantando
        const clientId = new TextDecoder().decode(idBytes);

        // Se é uma voz nova, alocamos um novo canal na nossa mesa de som
        if (!this.clientNodes.has(clientId)) {
          const newClientWorklet = new AudioWorkletNode(this.audioContext, 'audio-processor');
          newClientWorklet.connect(this.gainNode!);
          this.clientNodes.set(clientId, newClientWorklet);
        }

        const clientWorklet = this.clientNodes.get(clientId)!;

        // Processa o áudio binário especificamente para o canal isolado
        const pcm16 = new Int16Array(audioBytes);
        const float32 = new Float32Array(pcm16.length);
        for (let i = 0; i < pcm16.length; i++) {
          float32[i] = pcm16[i] < 0 ? pcm16[i] / 0x8000 : pcm16[i] / 0x7FFF;
        }
        
        clientWorklet.port.postMessage(float32);
      }
    };
  }

  async conectarApenasServidor() {
    // Conexão passiva: entra na sala apenas para monitorar o estado (Play/Stop)
    await this.conectarWebSocket();
    this.ws!.onmessage = (event) => {
      if (typeof event.data === 'string') {
        this.onComandoRecebido(JSON.parse(event.data));
      }
    };
  }

  async ligarMicrofone() {
    // Aciona as APIs nativas de Hardware do dispositivo móvel
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 24000, channelCount: 1 } 
      });

      this.audioContext = new AudioContext({ sampleRate: 24000 });
      await this.audioContext.audioWorklet.addModule('/audio-processor.js');

      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.workletNode = new AudioWorkletNode(this.audioContext, 'audio-processor');
      
      source.connect(this.workletNode);

      // Evento contínuo: acionado a cada bloco de áudio capturado
      this.workletNode.port.onmessage = (event) => {
        const audioData: Float32Array = event.data;
        const pcm16 = new Int16Array(audioData.length);
        
        // Comprime os dados Float32 em Int16 para reduzir a carga da rede
        for (let i = 0; i < audioData.length; i++) {
          const s = Math.max(-1, Math.min(1, audioData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        
        // Transmite o pacote otimizado via TCP persistente
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(pcm16.buffer);
        }
      };
    } catch (e) {
      console.error("Microfone bloqueado:", e);
      alert("Permissão do microfone negada. Não é possível cantar.");
    }
  }

  desligarMicrofone() {
    // Interrompe nós de áudio e desvincula as trilhas de hardware
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
    // Modula a amplitude de saída através do GainNode
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
    
    // Limpeza de Hardware: Mata todos os workers de áudio de terceiros
    this.clientNodes.forEach(node => node.disconnect());
    this.clientNodes.clear();
  }

  reconhecerMusica(): Promise<any> {
    // Inicia fluxo HTTP transacional (Requisicão/Resposta) via API
    return new Promise(async (resolve, reject) => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        const audioChunks: Blob[] = [];

        // Acumula os fragmentos gravados em um array temporário
        mediaRecorder.addEventListener("dataavailable", event => {
          if (event.data.size > 0) {
            audioChunks.push(event.data);
          }
        });

        // Evento finalizado: Encapsula no formato WebM para a rede
        mediaRecorder.addEventListener("stop", () => {
          const audioBlob = new Blob(audioChunks, { type: 'audio/webm' }); 
          stream.getTracks().forEach(track => track.stop());

          const formData = new FormData();
          formData.append('audio', audioBlob, 'amostra.webm');

          const url = `/api/recognize`;
          
          // Dispara o POST em bloco único e aguarda o proxy em Go processar
          this.http.post(url, formData).subscribe({
            next: (resultado) => resolve(resultado),
            error: (erro) => reject(erro)
          });
        });

        mediaRecorder.start();

        // Limita a amostra em 10 segundos exatos para otimizar o processamento
        setTimeout(() => {
          mediaRecorder.stop();
        }, 10000); 

      } catch (e) {
        reject(e);
      }
    });
  }
}