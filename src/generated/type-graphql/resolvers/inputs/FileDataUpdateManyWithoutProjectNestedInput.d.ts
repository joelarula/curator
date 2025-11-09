import { FileDataCreateManyProjectInputEnvelope } from "../inputs/FileDataCreateManyProjectInputEnvelope";
import { FileDataCreateOrConnectWithoutProjectInput } from "../inputs/FileDataCreateOrConnectWithoutProjectInput";
import { FileDataCreateWithoutProjectInput } from "../inputs/FileDataCreateWithoutProjectInput";
import { FileDataScalarWhereInput } from "../inputs/FileDataScalarWhereInput";
import { FileDataUpdateManyWithWhereWithoutProjectInput } from "../inputs/FileDataUpdateManyWithWhereWithoutProjectInput";
import { FileDataUpdateWithWhereUniqueWithoutProjectInput } from "../inputs/FileDataUpdateWithWhereUniqueWithoutProjectInput";
import { FileDataUpsertWithWhereUniqueWithoutProjectInput } from "../inputs/FileDataUpsertWithWhereUniqueWithoutProjectInput";
import { FileDataWhereUniqueInput } from "../inputs/FileDataWhereUniqueInput";
export declare class FileDataUpdateManyWithoutProjectNestedInput {
    create?: FileDataCreateWithoutProjectInput[] | undefined;
    connectOrCreate?: FileDataCreateOrConnectWithoutProjectInput[] | undefined;
    upsert?: FileDataUpsertWithWhereUniqueWithoutProjectInput[] | undefined;
    createMany?: FileDataCreateManyProjectInputEnvelope | undefined;
    set?: FileDataWhereUniqueInput[] | undefined;
    disconnect?: FileDataWhereUniqueInput[] | undefined;
    delete?: FileDataWhereUniqueInput[] | undefined;
    connect?: FileDataWhereUniqueInput[] | undefined;
    update?: FileDataUpdateWithWhereUniqueWithoutProjectInput[] | undefined;
    updateMany?: FileDataUpdateManyWithWhereWithoutProjectInput[] | undefined;
    deleteMany?: FileDataScalarWhereInput[] | undefined;
}
