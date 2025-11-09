import { NestedBytesNullableFilter } from "../inputs/NestedBytesNullableFilter";
import { NestedBytesNullableWithAggregatesFilter } from "../inputs/NestedBytesNullableWithAggregatesFilter";
import { NestedIntNullableFilter } from "../inputs/NestedIntNullableFilter";
export declare class BytesNullableWithAggregatesFilter {
    equals?: Buffer | undefined;
    in?: Buffer[] | undefined;
    notIn?: Buffer[] | undefined;
    not?: NestedBytesNullableWithAggregatesFilter | undefined;
    _count?: NestedIntNullableFilter | undefined;
    _min?: NestedBytesNullableFilter | undefined;
    _max?: NestedBytesNullableFilter | undefined;
}
