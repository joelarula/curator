import { DocumentCreateInput } from "../../../inputs/DocumentCreateInput";
import { DocumentUpdateInput } from "../../../inputs/DocumentUpdateInput";
import { DocumentWhereUniqueInput } from "../../../inputs/DocumentWhereUniqueInput";
export declare class UpsertOneDocumentArgs {
    where: DocumentWhereUniqueInput;
    create: DocumentCreateInput;
    update: DocumentUpdateInput;
}
