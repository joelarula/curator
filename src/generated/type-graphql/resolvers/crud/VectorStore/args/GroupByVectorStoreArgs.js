"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GroupByVectorStoreArgs = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const VectorStoreOrderByWithAggregationInput_1 = require("../../../inputs/VectorStoreOrderByWithAggregationInput");
const VectorStoreScalarWhereWithAggregatesInput_1 = require("../../../inputs/VectorStoreScalarWhereWithAggregatesInput");
const VectorStoreWhereInput_1 = require("../../../inputs/VectorStoreWhereInput");
const VectorStoreScalarFieldEnum_1 = require("../../../../enums/VectorStoreScalarFieldEnum");
let GroupByVectorStoreArgs = class GroupByVectorStoreArgs {
};
exports.GroupByVectorStoreArgs = GroupByVectorStoreArgs;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => VectorStoreWhereInput_1.VectorStoreWhereInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", VectorStoreWhereInput_1.VectorStoreWhereInput)
], GroupByVectorStoreArgs.prototype, "where", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [VectorStoreOrderByWithAggregationInput_1.VectorStoreOrderByWithAggregationInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], GroupByVectorStoreArgs.prototype, "orderBy", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [VectorStoreScalarFieldEnum_1.VectorStoreScalarFieldEnum], {
        nullable: false
    }),
    tslib_1.__metadata("design:type", Array)
], GroupByVectorStoreArgs.prototype, "by", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => VectorStoreScalarWhereWithAggregatesInput_1.VectorStoreScalarWhereWithAggregatesInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", VectorStoreScalarWhereWithAggregatesInput_1.VectorStoreScalarWhereWithAggregatesInput)
], GroupByVectorStoreArgs.prototype, "having", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], GroupByVectorStoreArgs.prototype, "take", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], GroupByVectorStoreArgs.prototype, "skip", void 0);
exports.GroupByVectorStoreArgs = GroupByVectorStoreArgs = tslib_1.__decorate([
    TypeGraphQL.ArgsType()
], GroupByVectorStoreArgs);
