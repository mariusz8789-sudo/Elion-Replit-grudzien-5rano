import { registerLab } from '../core/registry';
import { universeLab } from './universe';
import { spacetimeLab } from './spacetime';
import { einsteinLab } from './einstein';
import { quantumLab } from './quantum';
import { atomLab } from './atom';
import { nuclearLab } from './nuclear';
import { particleLab } from './particle';
import { chemistryLab } from './chemistry';
import { multiverseLab } from './multiverse';
import { civilizationLab } from './civilization';
import { biologyLab } from './biology';
import { mathematicsLab } from './mathematics';
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
registerLab(chemistryLab);
registerLab(multiverseLab);
registerLab(civilizationLab);
registerLab(biologyLab);
registerLab(mathematicsLab);
registerLab(discoveryLab);
