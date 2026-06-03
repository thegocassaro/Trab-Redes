import { Component } from '@angular/core';
import { AudioService } from './services/audio.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'client';

  constructor(private audioService: AudioService) {}

  startStreaming() {
    console.log("Botão Iniciar clicado!");
    this.audioService.start(); 
  }

  stopStreaming() {
    console.log("Botão Parar clicado!");
    this.audioService.stop(); 
  }
}