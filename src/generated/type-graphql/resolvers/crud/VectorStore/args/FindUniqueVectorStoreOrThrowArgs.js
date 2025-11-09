"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FindUniqueVectorStoreOrThrowArgs = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const VectorStoreWhereUniqueInput_1 = require("../../../inputs/VectorStoreWhereUniqueInput");
let FindUniqueVectorStoreOrThrowArgs = class FindUniqueVectorStoreOrThrowArgs {
};
exports.FindUniqueVectorStoreOrThrowArgs = FindUniqueVectorStoreOrThrowArgs;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => VectorStoreWhereUniqueInput_1.VectorStoreWhereUniqueInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", VectorStoreWhereUniqueInput_1.VectorStoreWhereUniqueInput)
], FindUniqueVectorStoreOrThrowArgs.prototype, "where", void 0);
exports.FindUniqueVectorStoreOrThrowArgs = FindUniqueVectorStoreOrThrowArgs = tslib_1.__decorate([
    TypeGraphQL.ArgsType()
], FindUniqueVectorStoreOrThrowArgs);
