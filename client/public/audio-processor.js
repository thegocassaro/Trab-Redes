class MyAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Em vez de uma fila de arrays, vamos manter um buffer linear (array simples)
    this.audioBuffer = []; 
    this.isPlaying = false;
    
    // Tamanho mínimo do buffer antes de começar a tocar (Jitter Buffer).
    // Para 48000Hz, 4096 amostras representam ~85ms de atraso. Aumente se a rede for instável.
    this.MIN_BUFFER_SIZE = 4096; 

    this.port.onmessage = (event) => {
      // event.data é o Float32Array vindo do servidor
      for (let i = 0; i < event.data.length; i++) {
        this.audioBuffer.push(event.data[i]);
      }
    };
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    // 1. CAPTURA
    if (input && input.length > 0 && input[0].length > 0) {
      // Faz uma cópia rápida do canal para enviar
      const channelData = new Float32Array(input[0]);
      this.port.postMessage(channelData);
    }

    // 2. CONTROLE DO JITTER BUFFER
    // Só começa a tocar quando tivermos dados suficientes acumulados
    if (!this.isPlaying && this.audioBuffer.length >= this.MIN_BUFFER_SIZE) {
      this.isPlaying = true;
    } else if (this.isPlaying && this.audioBuffer.length === 0) {
      // Se a rede travar muito e esvaziar tudo, para e espera acumular de novo
      this.isPlaying = false; 
    }

    // 3. REPRODUÇÃO
    for (let channel = 0; channel < output.length; channel++) {
      const outputChannel = output[channel];
      for (let i = 0; i < outputChannel.length; i++) {
        if (this.isPlaying && this.audioBuffer.length > 0) {
          // Remove a primeira amostra do buffer e toca (para otimizar depois, use RingBuffer)
          outputChannel[i] = this.audioBuffer.shift(); 
        } else {
          outputChannel[i] = 0; // Silêncio se não estiver tocando
        }
      }
    }

    return true; 
  }
}
registerProcessor('audio-processor', MyAudioProcessor);