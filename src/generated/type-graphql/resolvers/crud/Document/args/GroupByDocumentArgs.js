"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GroupByDocumentArgs = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const DocumentOrderByWithAggregationInput_1 = require("../../../inputs/DocumentOrderByWithAggregationInput");
const DocumentScalarWhereWithAggregatesInput_1 = require("../../../inputs/DocumentScalarWhereWithAggregatesInput");
const DocumentWhereInput_1 = require("../../../inputs/DocumentWhereInput");
const DocumentScalarFieldEnum_1 = require("../../../../enums/DocumentScalarFieldEnum");
let GroupByDocumentArgs = class GroupByDocumentArgs {
};
exports.GroupByDocumentArgs = GroupByDocumentArgs;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => DocumentWhereInput_1.DocumentWhereInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", DocumentWhereInput_1.DocumentWhereInput)
], GroupByDocumentArgs.prototype, "where", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [DocumentOrderByWithAggregationInput_1.DocumentOrderByWithAggregationInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], GroupByDocumentArgs.prototype, "orderBy", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [DocumentScalarFieldEnum_1.DocumentScalarFieldEnum], {
        nullable: false
    }),
    tslib_1.__metadata("design:type", Array)
], GroupByDocumentArgs.prototype, "by", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => DocumentScalarWhereWithAggregatesInput_1.DocumentScalarWhereWithAggregatesInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", DocumentScalarWhereWithAggregatesInput_1.DocumentScalarWhereWithAggregatesInput)
], GroupByDocumentArgs.prototype, "having", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], GroupByDocumentArgs.prototype, "take", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], GroupByDocumentArgs.prototype, "skip", void 0);
exports.GroupByDocumentArgs = GroupByDocumentArgs = tslib_1.__decorate([
    TypeGraphQL.ArgsType()
], GroupByDocumentArgs);
