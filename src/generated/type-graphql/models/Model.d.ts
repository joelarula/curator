import { Chunk } from "../models/Chunk";
import { ModelCount } from "../resolvers/outputs/ModelCount";
export declare class Model {
    id: number;
    name: string;
    columnName: string;
    source?: string | null;
    chunks?: Chunk[];
    _count?: ModelCount | null;
}
