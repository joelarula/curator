"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateManyModelArgs = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ModelUpdateManyMutationInput_1 = require("../../../inputs/ModelUpdateManyMutationInput");
const ModelWhereInput_1 = require("../../../inputs/ModelWhereInput");
let UpdateManyModelArgs = class UpdateManyModelArgs {
};
exports.UpdateManyModelArgs = UpdateManyModelArgs;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ModelUpdateManyMutationInput_1.ModelUpdateManyMutationInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", ModelUpdateManyMutationInput_1.ModelUpdateManyMutationInput)
], UpdateManyModelArgs.prototype, "data", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ModelWhereInput_1.ModelWhereInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ModelWhereInput_1.ModelWhereInput)
], UpdateManyModelArgs.prototype, "where", void 0);
exports.UpdateManyModelArgs = UpdateManyModelArgs = tslib_1.__decorate([
    TypeGraphQL.ArgsType()
], UpdateManyModelArgs);
