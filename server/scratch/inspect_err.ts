import { AIQ } from '../src/services/AIQ.js';

AIQ.init();

const uri = 'https://sport.err.ee/1610021590/tsehhi-korvpallitaht-astub-kaimasoleva-hooaja-jarel-korvale';

AIQ.get_resource({ uri })
    .onDone((res: any) => {
        const relations = res.subjectRelations?.map((r: any) => `${r.predicateUri} -> ${r.objectUri}`).join('\n');
        console.log("RELATIONS_START\n" + relations + "\nRELATIONS_END");
    });
