// Italian + English stopwords for caption term extraction (content is mixed IT/EN).
const EN = `a about above after again against all am an and any are as at be because been before being below between both but by
can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how
i if in into is it its itself just me more most my myself no nor not now of off on once only or other our ours ourselves out over own
same she should so some such than that the their theirs them themselves then there these they this those through to too under until up
very was we were what when where which while who whom why will with would you your yours yourself yourselves also get got like one
make made new see use via http https www com amp im dont youre ive its lets thats theres`;

const IT = `a ad al alla alle allo agli ai all anche avere aveva c che chi ci come con contro cosa cui da dal dalla dalle dallo dai dagli
dei del della delle dello degli di dove e ed era erano essere fa fino fra gli ha hanno ho i il in io la le lei li lo loro lui ma me mi
mia mie miei mio ne nei nel nella nelle nello negli noi non o per perché perche più piu poi quale quando quanto quella quelle quelli quello
questa queste questi questo se sei si sia siamo siete sono su sua sue sui sul sulla sulle sullo suo suoi ti tra tu tua tue tuo tuoi
un una uno vi voi è e' ecco fare fatto molto tutto tutti tutte tutta ogni oggi ora qui qua così cosi già gia sempre ancora proprio solo`;

export const STOPWORDS: ReadonlySet<string> = new Set(`${EN} ${IT}`.split(/\s+/).filter(Boolean));
