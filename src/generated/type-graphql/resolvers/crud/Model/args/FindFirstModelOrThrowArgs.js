"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FindFirstModelOrThrowArgs = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ModelOrderByWithRelationInput_1 = require("../../../inputs/ModelOrderByWithRelationInput");
const ModelWhereInput_1 = require("../../../inputs/ModelWhereInput");
const ModelWhereUniqueInput_1 = require("../../../inputs/ModelWhereUniqueInput");
const ModelScalarFieldEnum_1 = require("../../../../enums/ModelScalarFieldEnum");
let FindFirstModelOrThrowArgs = class FindFirstModelOrThrowArgs {
};
exports.FindFirstModelOrThrowArgs = FindFirstModelOrThrowArgs;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ModelWhereInput_1.ModelWhereInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ModelWhereInput_1.ModelWhereInput)
], FindFirstModelOrThrowArgs.prototype, "where", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ModelOrderByWithRelationInput_1.ModelOrderByWithRelationInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], FindFirstModelOrThrowArgs.prototype, "orderBy", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ModelWhereUniqueInput_1.ModelWhereUniqueInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ModelWhereUniqueInput_1.ModelWhereUniqueInput)
], FindFirstModelOrThrowArgs.prototype, "cursor", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], FindFirstModelOrThrowArgs.prototype, "take", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], FindFirstModelOrThrowArgs.prototype, "skip", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ModelScalarFieldEnum_1.ModelScalarFieldEnum], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], FindFirstModelOrThrowArgs.prototype, "distinct", void 0);
exports.FindFirstModelOrThrowArgs = FindFirstModelOrThrowArgs = tslib_1.__decorate([
    TypeGraphQL.ArgsType()
], FindFirstModelOrThrowArgs);
