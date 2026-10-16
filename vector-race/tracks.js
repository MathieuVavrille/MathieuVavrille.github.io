import { tr } from './i18n.js';
import { rect, line, turn, makeTrack } from './engine.js';

export const DEFINITIONS = [
  { id: 'elan', name: tr("tracks.premier.elan"), subtitle: tr("tracks.accelerer.anticiper.sarreter"), difficulty: tr("tracks.initiation"), tip: tr("tracks.la.vitesse.saccumule.commence.a.freiner.avant.de.rejoindre.la.ligne"), blocks: [rect(0, 4, 0, 14), line(0, 0, 5, true), line(0, 14, 5, false)] },
  { id: 'apex', name: tr("tracks.a.la.corde"), subtitle: tr("tracks.un.virage.mille.trajectoires"), difficulty: tr("tracks.facile"), tip: tr("tracks.freine.sur.un.axe.pendant.que.tu.acceleres.sur.lautre.cest.tout"), blocks: [rect(0, 4, 0, 9), turn([8, 9], 90, [4, 4], [8, 8]), rect(8, 22, 13, 17, false), line(0, 0, 5, true), line(22, 13, 5, false, false)] },
  { id: 'chicane', name: tr("tracks.double.declic"), subtitle: tr("tracks.trouver.le.rythme.de.la.chicane"), difficulty: tr("tracks.intermediaire"), tip: tr("tracks.ton.segment.entier.doit.rester.sur.la.route.un.point.accessible.peut"), blocks: [rect(0, 4, 0, 12), rect(0, 16, 8, 12, false), rect(12, 16, 8, 24), rect(12, 28, 20, 24, false), line(0, 0, 5, true), line(28, 20, 5, false, false)] },
  { id: 'epingle', name: tr("tracks.lepingle"), subtitle: tr("tracks.revenir.sur.ses.pas.avec.elegance"), difficulty: tr("tracks.intermediaire"), tip: tr("tracks.dans.lepingle.une.vitesse.proche.de.zero.peut.te.faire.gagner.des"), blocks: [rect(0, 3, 0, 19), rect(0, 15, 16, 19, false), rect(12, 15, 0, 19), line(0, 0, 4, true), line(12, 0, 4, false)] },
  { id: 'precision', name: tr("tracks.fil.de.vitesse"), subtitle: tr("tracks.de.lelan.et.de.la.precision"), difficulty: tr("tracks.difficile"), tip: tr("tracks.les.couloirs.etroits.demandent.de.planifier.le.freinage.deux.ou.trois.coups"), blocks: [rect(0, 3, 0, 14), rect(0, 17, 11, 14, false), rect(14, 17, -4, 14), rect(14, 31, -4, -1, false), rect(28, 31, -4, 18), line(0, 0, 4, true), line(28, 18, 4, false)] },
];
export function builtins(original) {
  const all = [...DEFINITIONS, { id: 'original', name: tr("tracks.le.grand.trace"), subtitle: tr("tracks.grand.trace.description"), difficulty: tr("tracks.expert"), tip: tr("tracks.grand.trace.tip"), blocks: original }];
  return all.map((d, i) => makeTrack(d.blocks, { ...d, number: i + 1, gold: null }));
}
