import { NestedBytesNullableFilter } from "../inputs/NestedBytesNullableFilter";
import { NestedIntNullableFilter } from "../inputs/NestedIntNullableFilter";
export declare class NestedBytesNullableWithAggregatesFilter {
    equals?: Buffer | undefined;
    in?: Buffer[] | undefined;
    notIn?: Buffer[] | undefined;
    not?: NestedBytesNullableWithAggregatesFilter | undefined;
    _count?: NestedIntNullableFilter | undefined;
    _min?: NestedBytesNullableFilter | undefined;
    _max?: NestedBytesNullableFilter | undefined;
}
