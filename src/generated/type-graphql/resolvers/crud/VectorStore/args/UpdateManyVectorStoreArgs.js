"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateManyVectorStoreArgs = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const VectorStoreUpdateManyMutationInput_1 = require("../../../inputs/VectorStoreUpdateManyMutationInput");
const VectorStoreWhereInput_1 = require("../../../inputs/VectorStoreWhereInput");
let UpdateManyVectorStoreArgs = class UpdateManyVectorStoreArgs {
};
exports.UpdateManyVectorStoreArgs = UpdateManyVectorStoreArgs;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => VectorStoreUpdateManyMutationInput_1.VectorStoreUpdateManyMutationInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", VectorStoreUpdateManyMutationInput_1.VectorStoreUpdateManyMutationInput)
], UpdateManyVectorStoreArgs.prototype, "data", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => VectorStoreWhereInput_1.VectorStoreWhereInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", VectorStoreWhereInput_1.VectorStoreWhereInput)
], UpdateManyVectorStoreArgs.prototype, "where", void 0);
exports.UpdateManyVectorStoreArgs = UpdateManyVectorStoreArgs = tslib_1.__decorate([
    TypeGraphQL.ArgsType()
], UpdateManyVectorStoreArgs);
