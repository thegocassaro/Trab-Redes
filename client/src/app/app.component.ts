import { Component } from '@angular/core';
// import { AudioService } from './services/audio.service';
@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'client';

  // O frontend agora começa com a lista de resultados totalmente vazia
  musicasFiltradas: string[] = [];
  musicaSelecionada: string = '';
  participantes: string[] = [];
  
  jaCadastrado: boolean = false;
  /**
   * Modificado para simular uma requisição para uma API externa
   * Temos que ver como fazer isso, usar alguma API ou usar o projeto do outro grupo
   */
  aoDigitar(termo: string) {
    if (termo.trim() === '') {
      this.musicasFiltradas = [];
      return;
    }
    this.simularBuscaNaAPI(termo);
  }

  selecionarMusica(musica: string, inputElement: HTMLInputElement) {
    inputElement.value = musica;        // Coloca o nome da música no campo de busca
    this.musicaSelecionada = musica;    // Salva a música escolhida
    this.musicasFiltradas = [];         // Esconde a lista de resultados
    console.log(`Música selecionada pelo participante: ${musica}`);
  }
  
  adicionarParticipante(nome: string, inputElement: HTMLInputElement) {
    // Se a trava já estiver ativa, barra a execução imediatamente
    if (this.jaCadastrado) {
      alert('Você já possui um microfone ativo nesta sessão!');
      return;
    }

    const nomeLimpo = nome.trim();
    if (nomeLimpo === '') {
      alert('Por favor, digite um nome antes de adicionar!');
      return;
    }

    this.participantes.push(nomeLimpo);
    this.jaCadastrado = true; // Ativa a trava para impedir novas inserções
    inputElement.value = '';  // Limpa o campo
    console.log(`Microfone registrado. Estado da trava: BLOQUEADO.`);
  }
  
  removerParticipante(nome: string) {
    // Filtra a lista removendo o participante clicado
    this.participantes = this.participantes.filter(p => p !== nome);
    
    // Libera a trava de segurança
    this.jaCadastrado = false;
    
    console.log(`Microfone de "${nome}" removido. Estado da trava: LIBERADO.`);
  }

  startStreaming() {
    if (!this.musicaSelecionada) {
      alert('Por favor, selecione uma música antes de iniciar!');
      return;
    }
    console.log(`Iniciando transmissão da música: ${this.musicaSelecionada}`);
    console.log(`Lista de microfones integrados:`, this.participantes);
  }

  private simularBuscaNaAPI(termo: string) {
    const bancoRemoto = [
      'Evidências - Chitãozinho & Xororó',
      'Fogo e Paixão - Wando',
      'Anna Julia - Los Hermanos'
    ];
    this.musicasFiltradas = bancoRemoto.filter(m => 
      m.toLowerCase().includes(termo.toLowerCase())
    );
  }

}