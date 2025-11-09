"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FindUniqueVectorStoreArgs = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const VectorStoreWhereUniqueInput_1 = require("../../../inputs/VectorStoreWhereUniqueInput");
let FindUniqueVectorStoreArgs = class FindUniqueVectorStoreArgs {
};
exports.FindUniqueVectorStoreArgs = FindUniqueVectorStoreArgs;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => VectorStoreWhereUniqueInput_1.VectorStoreWhereUniqueInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", VectorStoreWhereUniqueInput_1.VectorStoreWhereUniqueInput)
], FindUniqueVectorStoreArgs.prototype, "where", void 0);
exports.FindUniqueVectorStoreArgs = FindUniqueVectorStoreArgs = tslib_1.__decorate([
    TypeGraphQL.ArgsType()
], FindUniqueVectorStoreArgs);
