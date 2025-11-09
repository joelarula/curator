"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeleteManyVectorStoreArgs = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const VectorStoreWhereInput_1 = require("../../../inputs/VectorStoreWhereInput");
let DeleteManyVectorStoreArgs = class DeleteManyVectorStoreArgs {
};
exports.DeleteManyVectorStoreArgs = DeleteManyVectorStoreArgs;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => VectorStoreWhereInput_1.VectorStoreWhereInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", VectorStoreWhereInput_1.VectorStoreWhereInput)
], DeleteManyVectorStoreArgs.prototype, "where", void 0);
exports.DeleteManyVectorStoreArgs = DeleteManyVectorStoreArgs = tslib_1.__decorate([
    TypeGraphQL.ArgsType()
], DeleteManyVectorStoreArgs);
