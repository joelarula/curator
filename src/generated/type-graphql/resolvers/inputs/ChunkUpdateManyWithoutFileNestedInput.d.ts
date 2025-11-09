import { ChunkScalarWhereInput } from "../inputs/ChunkScalarWhereInput";
import { ChunkUpdateManyWithWhereWithoutFileInput } from "../inputs/ChunkUpdateManyWithWhereWithoutFileInput";
import { ChunkUpdateWithWhereUniqueWithoutFileInput } from "../inputs/ChunkUpdateWithWhereUniqueWithoutFileInput";
import { ChunkWhereUniqueInput } from "../inputs/ChunkWhereUniqueInput";
export declare class ChunkUpdateManyWithoutFileNestedInput {
    set?: ChunkWhereUniqueInput[] | undefined;
    disconnect?: ChunkWhereUniqueInput[] | undefined;
    delete?: ChunkWhereUniqueInput[] | undefined;
    connect?: ChunkWhereUniqueInput[] | undefined;
    update?: ChunkUpdateWithWhereUniqueWithoutFileInput[] | undefined;
    updateMany?: ChunkUpdateManyWithWhereWithoutFileInput[] | undefined;
    deleteMany?: ChunkScalarWhereInput[] | undefined;
}
