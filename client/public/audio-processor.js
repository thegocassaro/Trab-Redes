class MyAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Memória Linear: Armazena as amostras de áudio recebidas da rede via WebSocket
    this.audioBuffer = []; 
    this.isPlaying = false;
    
    // Jitter Buffer: Mitigação de latência do TCP. 
    // Retém 2048 amostras (~85ms a 24000Hz) para absorver oscilações da rede.
    this.MIN_BUFFER_SIZE = 2048; 

    this.port.onmessage = (event) => {
      // Recepção: Desempacota o payload convertido e enfileira no buffer local
      for (let i = 0; i < event.data.length; i++) {
        this.audioBuffer.push(event.data[i]);
      }      
    };
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    // 1. CAPTURA (Microfone -> Rede)
    if (input && input.length > 0 && input[0].length > 0) {
      // Extrai o sinal físico nativo (Float32) e repassa para o AudioService comprimir e enviar
      const channelData = new Float32Array(input[0]);
      this.port.postMessage(channelData);
    }

    // 2. MITIGAÇÃO DE REDE (Controle do Jitter Buffer)
    if (!this.isPlaying && this.audioBuffer.length >= this.MIN_BUFFER_SIZE) {
      // Acúmulo de Segurança: Atingiu o mínimo de pacotes, libera a reprodução contínua
      this.isPlaying = true;
    } else if (this.isPlaying && this.audioBuffer.length === 0) {
      // Prevenção de Starvation: Se o TCP engasgar e o buffer secar, pausa e aguarda reabastecer
      this.isPlaying = false; 
    }

    // 3. REPRODUÇÃO (Rede -> Caixa de Som)
    for (let channel = 0; channel < output.length; channel++) {
      const outputChannel = output[channel];
      for (let i = 0; i < outputChannel.length; i++) {
        if (this.isPlaying && this.audioBuffer.length > 0) {
          // Consumo FIFO: Retira a amostra mais antiga e injeta na saída física
          // (Ponto de melhoria arquitetural futura: Implementar um RingBuffer)
          outputChannel[i] = this.audioBuffer.shift(); 
        } else {
          // Fallback: Zera a voltagem do sinal (silêncio absoluto) enquanto aguarda a rede
          outputChannel[i] = 0; 
        }
      }
    }

    // Mantém o processador vivo no ciclo de vida do AudioContext
    return true; 
  }
}
registerProcessor('audio-processor', MyAudioProcessor);