import { registerLab } from '../core/registry';
import { universeLab } from './universe';
import { spacetimeLab } from './spacetime';
import { einsteinLab } from './einstein';
import { quantumLab } from './quantum';
import { atomLab } from './atom';
import { nuclearLab } from './nuclear';
import { particleLab } from './particle';
import { multiverseLab } from './multiverse';
import { civilizationLab } from './civilization';
import { discoveryLab } from './discovery';

/**
 * Manifest pluginów. Kolejność = kolejność na ekranie głównym.
 * Nowe laboratorium: dodaj plik w src/labs/ i jedną linię tutaj.
 */
registerLab(universeLab);
registerLab(spacetimeLab);
registerLab(einsteinLab);
registerLab(quantumLab);
registerLab(atomLab);
registerLab(nuclearLab);
registerLab(particleLab);
registerLab(multiverseLab);
registerLab(civilizationLab);
registerLab(discoveryLab);
