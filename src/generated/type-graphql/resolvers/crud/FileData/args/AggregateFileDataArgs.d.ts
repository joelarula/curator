import { FileDataOrderByWithRelationInput } from "../../../inputs/FileDataOrderByWithRelationInput";
import { FileDataWhereInput } from "../../../inputs/FileDataWhereInput";
import { FileDataWhereUniqueInput } from "../../../inputs/FileDataWhereUniqueInput";
export declare class AggregateFileDataArgs {
    where?: FileDataWhereInput | undefined;
    orderBy?: FileDataOrderByWithRelationInput[] | undefined;
    cursor?: FileDataWhereUniqueInput | undefined;
    take?: number | undefined;
    skip?: number | undefined;
}
