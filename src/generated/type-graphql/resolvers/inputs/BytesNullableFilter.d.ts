import { NestedBytesNullableFilter } from "../inputs/NestedBytesNullableFilter";
export declare class BytesNullableFilter {
    equals?: Buffer | undefined;
    in?: Buffer[] | undefined;
    notIn?: Buffer[] | undefined;
    not?: NestedBytesNullableFilter | undefined;
}
