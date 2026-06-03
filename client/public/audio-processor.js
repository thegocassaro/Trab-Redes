// public/audio-processor.js

class MyAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.playbackQueue = []; // Fila para guardar o áudio que precisamos tocar

    // Escuta quando o Angular (thread principal) envia áudio vindo do servidor
    this.port.onmessage = (event) => {
      this.playbackQueue.push(event.data);
    };
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    // 1. CAPTURA: Se o microfone enviou dados, repassa para o Angular enviar para a rede
    if (input && input.length > 0 && input[0].length > 0) {
      const channelData = input[0];
      this.port.postMessage(channelData);
    }

    // 2. REPRODUÇÃO: Se houver áudio na fila para tocar e uma saída disponível
    if (output && output.length > 0 && this.playbackQueue.length > 0) {
      const outputChannel = output[0];
      const nextBuffer = this.playbackQueue.shift(); // Pega o bloco de áudio mais antigo
      
      // Copia os dados recebidos da rede direto para os alto-falantes
      for (let i = 0; i < outputChannel.length; i++) {
        outputChannel[i] = nextBuffer[i] || 0;
      }
    }

    return true; 
  }
}

registerProcessor('audio-processor', MyAudioProcessor);