"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GroupByModelArgs = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ModelOrderByWithAggregationInput_1 = require("../../../inputs/ModelOrderByWithAggregationInput");
const ModelScalarWhereWithAggregatesInput_1 = require("../../../inputs/ModelScalarWhereWithAggregatesInput");
const ModelWhereInput_1 = require("../../../inputs/ModelWhereInput");
const ModelScalarFieldEnum_1 = require("../../../../enums/ModelScalarFieldEnum");
let GroupByModelArgs = class GroupByModelArgs {
};
exports.GroupByModelArgs = GroupByModelArgs;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ModelWhereInput_1.ModelWhereInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ModelWhereInput_1.ModelWhereInput)
], GroupByModelArgs.prototype, "where", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ModelOrderByWithAggregationInput_1.ModelOrderByWithAggregationInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], GroupByModelArgs.prototype, "orderBy", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ModelScalarFieldEnum_1.ModelScalarFieldEnum], {
        nullable: false
    }),
    tslib_1.__metadata("design:type", Array)
], GroupByModelArgs.prototype, "by", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ModelScalarWhereWithAggregatesInput_1.ModelScalarWhereWithAggregatesInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ModelScalarWhereWithAggregatesInput_1.ModelScalarWhereWithAggregatesInput)
], GroupByModelArgs.prototype, "having", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], GroupByModelArgs.prototype, "take", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], GroupByModelArgs.prototype, "skip", void 0);
exports.GroupByModelArgs = GroupByModelArgs = tslib_1.__decorate([
    TypeGraphQL.ArgsType()
], GroupByModelArgs);
