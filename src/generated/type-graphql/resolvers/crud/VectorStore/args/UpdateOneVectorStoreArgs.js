"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateOneVectorStoreArgs = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const VectorStoreUpdateInput_1 = require("../../../inputs/VectorStoreUpdateInput");
const VectorStoreWhereUniqueInput_1 = require("../../../inputs/VectorStoreWhereUniqueInput");
let UpdateOneVectorStoreArgs = class UpdateOneVectorStoreArgs {
};
exports.UpdateOneVectorStoreArgs = UpdateOneVectorStoreArgs;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => VectorStoreUpdateInput_1.VectorStoreUpdateInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", VectorStoreUpdateInput_1.VectorStoreUpdateInput)
], UpdateOneVectorStoreArgs.prototype, "data", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => VectorStoreWhereUniqueInput_1.VectorStoreWhereUniqueInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", VectorStoreWhereUniqueInput_1.VectorStoreWhereUniqueInput)
], UpdateOneVectorStoreArgs.prototype, "where", void 0);
exports.UpdateOneVectorStoreArgs = UpdateOneVectorStoreArgs = tslib_1.__decorate([
    TypeGraphQL.ArgsType()
], UpdateOneVectorStoreArgs);
