import { ChunkScalarWhereInput } from "../inputs/ChunkScalarWhereInput";
import { ChunkUpdateManyWithWhereWithoutModelInput } from "../inputs/ChunkUpdateManyWithWhereWithoutModelInput";
import { ChunkUpdateWithWhereUniqueWithoutModelInput } from "../inputs/ChunkUpdateWithWhereUniqueWithoutModelInput";
import { ChunkWhereUniqueInput } from "../inputs/ChunkWhereUniqueInput";
export declare class ChunkUpdateManyWithoutModelNestedInput {
    set?: ChunkWhereUniqueInput[] | undefined;
    disconnect?: ChunkWhereUniqueInput[] | undefined;
    delete?: ChunkWhereUniqueInput[] | undefined;
    connect?: ChunkWhereUniqueInput[] | undefined;
    update?: ChunkUpdateWithWhereUniqueWithoutModelInput[] | undefined;
    updateMany?: ChunkUpdateManyWithWhereWithoutModelInput[] | undefined;
    deleteMany?: ChunkScalarWhereInput[] | undefined;
}
