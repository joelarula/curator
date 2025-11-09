"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelWhereUniqueInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ChunkListRelationFilter_1 = require("../inputs/ChunkListRelationFilter");
const ModelWhereInput_1 = require("../inputs/ModelWhereInput");
const StringFilter_1 = require("../inputs/StringFilter");
const StringNullableFilter_1 = require("../inputs/StringNullableFilter");
let ModelWhereUniqueInput = class ModelWhereUniqueInput {
};
exports.ModelWhereUniqueInput = ModelWhereUniqueInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], ModelWhereUniqueInput.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ModelWhereUniqueInput.prototype, "name", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ModelWhereInput_1.ModelWhereInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], ModelWhereUniqueInput.prototype, "AND", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ModelWhereInput_1.ModelWhereInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], ModelWhereUniqueInput.prototype, "OR", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ModelWhereInput_1.ModelWhereInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], ModelWhereUniqueInput.prototype, "NOT", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringFilter_1.StringFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringFilter_1.StringFilter)
], ModelWhereUniqueInput.prototype, "columnName", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringNullableFilter_1.StringNullableFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringNullableFilter_1.StringNullableFilter)
], ModelWhereUniqueInput.prototype, "source", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ChunkListRelationFilter_1.ChunkListRelationFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ChunkListRelationFilter_1.ChunkListRelationFilter)
], ModelWhereUniqueInput.prototype, "chunks", void 0);
exports.ModelWhereUniqueInput = ModelWhereUniqueInput = tslib_1.__decorate([
    TypeGraphQL.InputType("ModelWhereUniqueInput", {})
], ModelWhereUniqueInput);
