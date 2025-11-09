"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FindManyVectorStoreArgs = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const VectorStoreOrderByWithRelationInput_1 = require("../../../inputs/VectorStoreOrderByWithRelationInput");
const VectorStoreWhereInput_1 = require("../../../inputs/VectorStoreWhereInput");
const VectorStoreWhereUniqueInput_1 = require("../../../inputs/VectorStoreWhereUniqueInput");
const VectorStoreScalarFieldEnum_1 = require("../../../../enums/VectorStoreScalarFieldEnum");
let FindManyVectorStoreArgs = class FindManyVectorStoreArgs {
};
exports.FindManyVectorStoreArgs = FindManyVectorStoreArgs;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => VectorStoreWhereInput_1.VectorStoreWhereInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", VectorStoreWhereInput_1.VectorStoreWhereInput)
], FindManyVectorStoreArgs.prototype, "where", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [VectorStoreOrderByWithRelationInput_1.VectorStoreOrderByWithRelationInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], FindManyVectorStoreArgs.prototype, "orderBy", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => VectorStoreWhereUniqueInput_1.VectorStoreWhereUniqueInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", VectorStoreWhereUniqueInput_1.VectorStoreWhereUniqueInput)
], FindManyVectorStoreArgs.prototype, "cursor", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], FindManyVectorStoreArgs.prototype, "take", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], FindManyVectorStoreArgs.prototype, "skip", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [VectorStoreScalarFieldEnum_1.VectorStoreScalarFieldEnum], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], FindManyVectorStoreArgs.prototype, "distinct", void 0);
exports.FindManyVectorStoreArgs = FindManyVectorStoreArgs = tslib_1.__decorate([
    TypeGraphQL.ArgsType()
], FindManyVectorStoreArgs);
