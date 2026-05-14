import { generateLayeredEditablePDF } from './utils/pdfGenerator.ts';

const run = async () => {
    try {
        // simulate success before browser specific code
        console.log("Success before printing!");
    } catch(err) {
        console.error("Caught error:", err);
    }
};

run();
