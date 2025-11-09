import { FileDataCreateInput } from "../../../inputs/FileDataCreateInput";
import { FileDataUpdateInput } from "../../../inputs/FileDataUpdateInput";
import { FileDataWhereUniqueInput } from "../../../inputs/FileDataWhereUniqueInput";
export declare class UpsertOneFileDataArgs {
    where: FileDataWhereUniqueInput;
    create: FileDataCreateInput;
    update: FileDataUpdateInput;
}
