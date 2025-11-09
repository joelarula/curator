import { ChunkCreateNestedManyWithoutModelInput } from "../inputs/ChunkCreateNestedManyWithoutModelInput";
export declare class ModelCreateInput {
    name: string;
    columnName: string;
    source?: string | undefined;
    chunks?: ChunkCreateNestedManyWithoutModelInput | undefined;
}
