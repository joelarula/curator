import { FileDataCreateManyProjectInputEnvelope } from "../inputs/FileDataCreateManyProjectInputEnvelope";
import { FileDataCreateOrConnectWithoutProjectInput } from "../inputs/FileDataCreateOrConnectWithoutProjectInput";
import { FileDataCreateWithoutProjectInput } from "../inputs/FileDataCreateWithoutProjectInput";
import { FileDataWhereUniqueInput } from "../inputs/FileDataWhereUniqueInput";
export declare class FileDataCreateNestedManyWithoutProjectInput {
    create?: FileDataCreateWithoutProjectInput[] | undefined;
    connectOrCreate?: FileDataCreateOrConnectWithoutProjectInput[] | undefined;
    createMany?: FileDataCreateManyProjectInputEnvelope | undefined;
    connect?: FileDataWhereUniqueInput[] | undefined;
}
