import { consult } from './src/service';

async function test() {
    try {
        const results = await consult('test');
        console.log('Results:', results);
    } catch (error) {
        console.error('Error:', error);
    }
}

test();
