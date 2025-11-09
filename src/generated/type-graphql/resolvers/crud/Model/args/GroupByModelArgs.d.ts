import { ModelOrderByWithAggregationInput } from "../../../inputs/ModelOrderByWithAggregationInput";
import { ModelScalarWhereWithAggregatesInput } from "../../../inputs/ModelScalarWhereWithAggregatesInput";
import { ModelWhereInput } from "../../../inputs/ModelWhereInput";
export declare class GroupByModelArgs {
    where?: ModelWhereInput | undefined;
    orderBy?: ModelOrderByWithAggregationInput[] | undefined;
    by: Array<"id" | "name" | "columnName" | "source">;
    having?: ModelScalarWhereWithAggregatesInput | undefined;
    take?: number | undefined;
    skip?: number | undefined;
}
