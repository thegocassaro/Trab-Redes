import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class AudioService {
  private audioContext?: AudioContext;
  private mediaStream?: MediaStream;
  private workletNode?: AudioWorkletNode;
  private gainNode?: GainNode;
  private ws?: WebSocket;

  constructor() { }

  async start() {
    try {

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        console.warn('Você já está transmitindo! Clique ignorado.');
        return;
      }

      // 1. Abre a conexão WebSocket com o servidor Go
      // Descobre automaticamente o IP/Hostname que você digitou na barra de endereço (ex: 192.168.18.201 ou localhost)
      const servidorIP = window.location.hostname;

      // Conecta na porta 8080 usando o IP correto
      this.ws = new WebSocket(`ws://${servidorIP}:8080/ws`);
      this.ws.binaryType = 'arraybuffer'; // Garante que trafegamos bytes puros

      this.ws.onopen = () => console.log('Conectado ao servidor Go via WebSocket!');
      this.ws.onclose = () => {
        console.log('Conexão com o servidor Go encerrada.');
        this.ws = undefined;
      };

      // 2. ESCUTA DA REDE: Recebe o áudio dos outros e joga no AudioWorklet para tocar
      this.ws.onmessage = (event: MessageEvent) => {
        const arrayBuffer: ArrayBuffer = event.data;
        const pcm16 = new Int16Array(arrayBuffer);

        // Converte de volta: PCM Int16 (-32768 a 32767) para Web Float32 (-1.0 a 1.0)
        const float32 = new Float32Array(pcm16.length);
        for (let i = 0; i < pcm16.length; i++) {
          float32[i] = pcm16[i] < 0 ? pcm16[i] / 0x8000 : pcm16[i] / 0x7FFF;
        }

        // Injeta os dados na thread de áudio para reprodução nas caixas de som
        if (this.workletNode) {
          this.workletNode.port.postMessage(float32);
        }
      };

      // 3. CAPTURA DO MICROFONE LOCAL
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          echoCancellation: true, 
          noiseSuppression: true, 
          sampleRate: 8000 
        } 
      });

      this.audioContext = new AudioContext({ sampleRate: 8000 });
      await this.audioContext.audioWorklet.addModule('/audio-processor.js');

      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.workletNode = new AudioWorkletNode(this.audioContext, 'audio-processor');

      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);

      // 3. Processa e envia o áudio
      this.workletNode.port.onmessage = (event) => {
        const audioData: Float32Array = event.data;
        
        // Converte Float32 (-1.0 a 1.0) para Int16 (PCM de 16 bits: -32768 a 32767)
        const pcm16 = new Int16Array(audioData.length);
        for (let i = 0; i < audioData.length; i++) {
          const s = Math.max(-1, Math.min(1, audioData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        // Se o WebSocket estiver aberto, descarrega os bytes na rede
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(pcm16.buffer);
        }
      };

      source.connect(this.workletNode);
      this.workletNode.connect(this.audioContext.destination);

      console.log("Streaming de áudio configurado e pronto!");

    } catch (error) {
      console.error("Erro ao iniciar transmissão:", error);
    }
  }

  stop() {
    if (this.ws) this.ws.close();
    if (this.workletNode) this.workletNode.disconnect();
    if (this.gainNode) this.gainNode.disconnect();
    if (this.audioContext) this.audioContext.close();
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
    }
    console.log("Transmissão encerrada.");
  }
}