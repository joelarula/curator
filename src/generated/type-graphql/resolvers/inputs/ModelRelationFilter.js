"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelRelationFilter = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ModelWhereInput_1 = require("../inputs/ModelWhereInput");
let ModelRelationFilter = class ModelRelationFilter {
};
exports.ModelRelationFilter = ModelRelationFilter;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ModelWhereInput_1.ModelWhereInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ModelWhereInput_1.ModelWhereInput)
], ModelRelationFilter.prototype, "is", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ModelWhereInput_1.ModelWhereInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ModelWhereInput_1.ModelWhereInput)
], ModelRelationFilter.prototype, "isNot", void 0);
exports.ModelRelationFilter = ModelRelationFilter = tslib_1.__decorate([
    TypeGraphQL.InputType("ModelRelationFilter", {})
], ModelRelationFilter);
