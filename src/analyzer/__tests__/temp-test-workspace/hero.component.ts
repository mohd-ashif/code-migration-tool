
      import { Component, OnInit } from '@angular/core';
      import { LoggerService } from './logger.service';

      @Component({
        selector: 'app-hero',
        template: '<h1>Hero works</h1>'
      })
      export class HeroComponent implements OnInit {
        constructor(private logger: LoggerService) {}
        ngOnInit() {
          this.logger.log('Hero init');
        }
      }
    